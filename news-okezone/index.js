'use strict';

const gallery_template = require('./gallery_template');
const libingester = require('libingester');
const mustache = require('mustache');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const gallery_section = 'http://news.okezone.com/foto'; // Galleries home section
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
    '.wrap-rekomen', //recomendation links
    '#AdAsia', //Asia ads
    'noscript', //any script injection
    'script', //any script injection
];

//Remove elements
const remove_gallery_elements = [
    '.new-meta-date', //date container
    '.wrap-rekomen', //recomendation links
    '#AdAsia', //Asia ads
    'h1', //gallery titles
    'noscript', //any script injection
    'script', //any script injection
];

function ingest_article_profile(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const title = $profile('h1').first().text();
        if (!title) { //problem with incomplete $profile 
            throw { code: -1 };
            return;
        }
        const asset = new libingester.NewsArticle();
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        asset.set_canonical_uri(uri);

        // Pull out the updated date
        const metadata = JSON.parse($profile('script[type="application/ld+json"]').text());
        const modified_date = new Date(Date.parse(metadata.dateModified));
        const published = $profile('.meta-post time').first().text();

        asset.set_last_modified_date(modified_date);
        asset.set_section(metadata.keywords.join(', '));
        asset.set_synopsis(metadata.description);
        asset.set_title(title);

        const date = new Date(Date.parse(metadata.datePublished));
        const reporter = metadata.author.name;
        const category = metadata.keywords.join(", ");

        // Pull out the main image
        const main_img = $profile('.detail-img img').first();
        const main_image = libingester.util.download_img(main_img, base_uri);
        const image_description = $profile('.caption-img-ab').children().text();
        main_image.set_title(title);
        hatch.save_asset(main_image);
        asset.set_thumbnail(main_image);

        // Create constant for body
        let body = $profile('#contentx, .bg-euro-body-news-hnews-content-textisi').first();

        //remove elements
        for (const remove_element of remove_elements) {
            body.find(remove_element).remove();
        }
        body.contents().filter((index, node) => node.type === 'comment').remove();

        //Download images
        body.find("img").map(function() {
            if (this.attribs.src) {
                const image = libingester.util.download_img($profile(this), base_uri);
                image.set_title(title)
                hatch.save_asset(image);
                this.attribs["data-libingester-asset-id"] = image.asset_id;
                for (const meta of remove_attrs_img) {
                    delete this.attribs[meta];
                }
            }
        });

        body.find("iframe").remove(); //Delete iframe container

        // Construct a new document containing the content we want.
        const content = mustache.render(template.structure_template, {
            title: title,
            author: reporter,
            date_published: published,
            category: category,
            main_image: main_image,
            image_credit: image_description,
            body: body.html(),
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    }).catch((err) => {
        if (err.code == -1 || err.statusCode == 403) {
            return ingest_gallery_article_profile(hatch, uri);
        }
    });
}

function ingest_gallery_article_profile(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const title = $profile('h1').first().text();
        if (!title) { //problem with incomplete profile 
            throw { code: -1 };
            return;
        }
        const asset = new libingester.NewsArticle();
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        asset.set_canonical_uri(uri);

        const modified_date = new Date(); //This section doesn´t have date in metadata
        asset.set_last_modified_date(modified_date);
        asset.set_section("Gallery");

        //Set title section
        asset.set_title(title);
        const description = $profile('meta[name="description"]').attr('content');
        asset.set_synopsis(description);

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
            const img_gallery = libingester.util.download_img($profile(this), base_uri);
            hatch.save_asset(img_gallery);
            return img_gallery;
        }).get();

        //remove elements
        for (const remove_element of remove_gallery_elements) {
            body.find(remove_element).remove();
        }
        body.contents().filter((index, node) => node.type === 'comment').remove();

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
    }).catch((err) => {
        if (err.statusCode == 403) {
            return ingest_gallery_article_profile(hatch, uri);
        }
    });
}

function main() {
    const hatch = new libingester.Hatch();
    const news = rss2json.load(rss_uri, function(err, rss) {
        const news_uris = rss.items.map((datum) => datum.link);
        return Promise.all(news_uris.map((uri) => ingest_article_profile(hatch, uri)));
    });

    const gallery = libingester.util.fetch_html(gallery_section).then(($galleries) => {
        const foto_links = $galleries('ul.list-berita li .wp-thumb-news a:first-of-type').map(function() {
            const uri = $galleries(this).attr('href');
            return url.resolve(gallery_section, uri);
        }).get();
        return Promise.all(foto_links.map((uri) => ingest_gallery_article_profile(hatch, uri)));
    });

    Promise.all([news, gallery]).then(values => {
        return hatch.finish();
    });
}

main();