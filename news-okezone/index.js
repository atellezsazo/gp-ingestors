'use strict';

const gallery_template = require('./gallery_template');
const libingester = require('libingester');
const mustache = require('mustache');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const gallery_section = 'http://news.okezone.com/foto'; // Galleries home section
const video_section = 'http://news.okezone.com/video/'; // Galleries home section
const rss_uri = "http://sindikasi.okezone.com/index.php/rss/1/RSS2.0"; //News RSS

//remove attributes from images
const remove_attrs_img = [
    'border',
    'class',
    'id',
    'src',
];

//Remove elements
const remove_elements = [
    'noscript', //any script injection
    'script', //any script injection
    '.wrap-rekomen', //recomendation links
    '#AdAsia', //Asia ads
];

//embedded content
const video_iframes = [
    'youtube', //YouTube
    'dailymotion', //Dailymotion
];

function add_embedded_images(base_uri, container, hatch, tag) {
    container.find(tag).map(function() {
        if (this.attribs.src) {
            const image = libingester.util.download_img(this, base_uri);
            hatch.save_asset(image);
            this.attribs["data-libingester-asset-id"] = image.asset_id;
            for (const meta of remove_attrs_img) {
                delete this.attribs[meta];
            }
        }
    });
}

function ingest_article_profile(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const asset = new libingester.NewsArticle();
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);

        asset.set_canonical_uri(uri);

        // Pull out the updated date
        const metadata = JSON.parse($profile('script[type="application/ld+json"]').text());
        const modified_date = new Date(Date.parse(metadata.dateModified));

        asset.set_last_modified_date(modified_date);
        asset.set_section(metadata.keywords.join(' '));

        //Set title section
        const title = $profile('h1').text();
        asset.set_title(title);

        const date = new Date(Date.parse(metadata.datePublished));
        const reporter = metadata.author.name;
        const category = metadata.keywords.join(", ");
        const post_tags = metadata.keywords.join(", ");

        // Pull out the main image
        const main_img = $profile('.detail-img img').first();
        const main_image = libingester.util.download_img(main_img, base_uri);
        const image_description = $profile('.caption-img-ab').children().text();
        hatch.save_asset(main_image);
        asset.set_thumbnail(main_image);

        // Create constant for body
        let body = $profile('#contentx, .bg-euro-body-news-hnews-content-textisi').first();

        //remove elements
        for (const remove_element of remove_elements) {
            body.find(remove_element).remove();
        }

        //Download images 
        add_embedded_images(base_uri, body, hatch, "img");

        //Download videos 
        const videos = $profile("iframe").map(function() {
            const iframe_src = this.attribs.src;
            for (const video_iframe of video_iframes) {
                if (iframe_src.includes(video_iframe)) {
                    const video_url = this.attribs.src;
                    const video_asset = new libingester.VideoAsset();
                    video_asset.set_canonical_uri(video_url);
                    video_asset.set_last_modified_date(modified_date);
                    video_asset.set_title(title);
                    video_asset.set_download_uri(video_url);
                    hatch.save_asset(video_asset);
                }
            }
        });

        body.find("iframe").remove(); //Delete iframe container

        // Construct a new document containing the content we want.
        const content = mustache.render(template.structure_template, {
            title: title,
            author: reporter,
            date_published: date,
            category: category,
            main_image: main_image,
            image_credit: image_description,
            body: body.html(),
            post_tags: post_tags,
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    });
}

//Remove elements
const remove_gallery_elements = ['noscript', //any script injection
    'script', //any script injection
    '.wrap-rekomen', //recomendation links
    '#AdAsia', //Asia ads
    'h1', //gallery titles
    '.new-meta-date', //date container
];

function ingest_gallery_article_profile(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const asset = new libingester.NewsArticle();
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);

        asset.set_canonical_uri(uri);

        const modified_date = new Date(); //This section doesn´t have date in metadata 
        asset.set_last_modified_date(modified_date);
        asset.set_section("Gallery");

        //Set title section
        const title = $profile('h1').text();  
        asset.set_title(title);

        const date = $profile('.news-fl').text();
        const references = $profile('.news-fr').text();

        let main_img = $profile('link[rel=image_src]').attr('href');
        main_img = main_img.replace('small', 'large');

        const main_image = libingester.util.download_image(main_img);
        hatch.save_asset(main_image);
        asset.set_thumbnail(main_image);

        // Create constant for body
        const body = $profile('.detail-isi').first();

        const image_gallery = $profile('.aphotos img').map(function() {
            this.attribs.src = this.attribs.src.replace('small.', 'large.');
            const asset = libingester.util.download_img(this, base_uri);
            hatch.save_asset(asset);
            return asset;
        }).get();

        //remove elements
        for (const remove_element of remove_gallery_elements) {
            body.find(remove_element).remove();
        }

        // Construct a new document containing the content we want.
        const content = mustache.render(gallery_template.gallery_structure_template, {
            title: title,
            author: references,
            date_published: date,
            images: image_gallery,
            body: body.html(),
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    });
}

function ingest_video_article_profile(hatch, uri, video_thumb) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        // Download videos 
        const videos = $profile("#player").map(function() {
            const iframe_src = this.attribs.src;
            if (typeof iframe_src != 'undefined') {
                for (const video_iframe of video_iframes) {
                    if (iframe_src.includes(video_iframe)) {

                        const title = $profile('h1').text();       
                        const synopsis = $profile('.detail-isi p').text();
                        const video_url = this.attribs.src;
                        
                        const main_image = libingester.util.download_image(video_thumb);
                        main_image.set_title(title);
                        hatch.save_asset(main_image);

                        const video_asset = new libingester.VideoAsset();
                        video_asset.set_canonical_uri(video_url);
                        video_asset.set_title(title);
                        video_asset.set_synopsis(synopsis);
                        video_asset.set_download_uri(video_url);
                        video_asset.set_thumbnail(main_image);
                        hatch.save_asset(video_asset);
                    }
                }
            }
        });
    });
}

function main() {
    const hatch = new libingester.Hatch();

    const news = new Promise((resolve, reject) => {
        rss2json.load(rss_uri, function(err, rss) {
            const news_uris = rss.items.map((datum) => datum.link);
            Promise.all(news_uris.map((uri) => ingest_article_profile(hatch, uri))).then(() => {
                resolve(true);
            });
        });
    });


    const gallery = new Promise((resolve, reject) => {
        libingester.util.fetch_html(gallery_section).then(($galleries) => {
            const foto_links = $galleries('ul.list-berita li .wp-thumb-news a:first-of-type').map(function() {
                const uri = $galleries(this).attr('href');
                return url.resolve(gallery_section, uri);
            }).get();
            Promise.all(foto_links.map((uri) => ingest_gallery_article_profile(hatch, uri))).then(() => {
                resolve(true);
            });
        });
    });

    // const video = new Promise((resolve, reject) => {
    //     libingester.util.fetch_html(video_section).then(($videos) => {
    //         const video_links = $videos('.news-content li').map(function() {
    //             const uri = $videos(this).find("h3 a").attr("href");
    //             const video_thumb = $videos(this).find(".thumb-news").attr("src");
    //             return {
    //                 link: url.resolve(video_section, uri),
    //                 thumb: video_thumb,
    //             }
    //         }).get();
    //         Promise.all(video_links.map((obj) => ingest_video_article_profile(hatch, obj.link, obj.thumb))).then(() => {
    //             resolve(true);
    //         });
    //     });
    // });

    Promise.all([news, gallery]).then(values => {
        return hatch.finish();
    }); 
}

main();