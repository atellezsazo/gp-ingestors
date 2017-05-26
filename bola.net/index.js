'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const template = require('./template');
const url = require('url');

const base_uri = 'https://www.bola.net/';
const gallery_uri = 'https://www.bola.net/galeri/';
const rss_uri = 'https://www.bola.net/feed/';

// clean images
const remove_attr = ['class', 'data-src', 'data-te-category', 'data-te-label',
    'data-te-tracked', 'src', 'style'
];

// Remove elements (body)
const remove_elements = ['.clear', '.detail-slot-youtube', '.promo-ta',
    '.related_content_widget', '.twitter-tweet', '#iframe_video_partner',
    '#infeed-desktop-cont', 'iframe', 'link', 'script', 'style'
];

// embed video
const video_iframes = ['a.kapanlagi', 'skrin.id', 'streamable', 'youtube'];

// render
const render_template = (hatch, asset, template, post_data) => {
    const content = mustache.render(template, post_data);
    asset.set_document(content);
    hatch.save_asset(asset);
}

// extract data for video
function get_json_parse(source) {
    const s = source.substring(source.indexOf('JSON.parse(\'[')+13);
	return (s.substring(0, s.indexOf(');')-3).replace(new RegExp('["{]','g'),'')).split('},').map((s) => {
		let dic = {};
		for(const d of s.split(',')) {
			dic[d.substring(0,d.indexOf(':'))] = d.substring(d.indexOf(':')+1);
		}
		return dic;
	});
}

function pad(n, width, z='0') {
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}


/**
 * ingest_article
 *
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {Object} obj The objec {} with metadata (uri, author, etc)
 */
function ingest_article(hatch, obj) {
    return libingester.util.fetch_html(obj.uri).then(($) => {
        const asset = new libingester.NewsArticle();
        const body = $('div.ncont').first();
        const category = $('div.nav').first();
        const main_image_uri = $('meta[property="og:image"]').attr('content');
        const section = $('meta[name="keywords"]').attr('content');
        const synopsis = $('meta[property="og:description"]').attr('content');

        // article settings
        asset.set_canonical_uri(obj.uri);
        asset.set_section(section);
        asset.set_title(obj.title);
        asset.set_synopsis(synopsis);

        // fixing relative paths
        category.find('a').map(function() {
            this.attribs.href = url.resolve(base_uri, this.attribs.href);
            for(const attr of remove_attr) {
                $(this).removeAttr(attr);
            }
        });

        // set modified date
        const modified_time = $('div.newsdatetime').text();
        const date = new Date(Date.parse(obj.pubDate));
        asset.set_last_modified_date(date);

        // main image
        const main_image = libingester.util.download_image(main_image_uri);
        main_image.set_title(obj.title);
        asset.set_thumbnail(main_image);
        hatch.save_asset(main_image);

        // remove elements and comments
        body.contents().filter((index, node) => node.type === 'comment').remove();
        for(const element of remove_elements) {
            body.find(element).remove();
        }

        // download images
        body.find('img').get().map((img) => {
            const image = libingester.util.download_image(img.attribs['data-src']);
            image.set_title(obj.title);
            img.attribs["data-libingester-asset-id"] = image.asset_id;
            hatch.save_asset(image);
        });

        render_template(hatch, asset, template.structure_template, {
            author: obj.author,
            body: body.html(),
            category: category.html(),
            main_image: main_image,
            published: modified_time,
            title: obj.title,
        });
    }).catch((err) => {
        return ingest_article(hatch, obj);
    });
}

/**
 * ingest_gallery
 *
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The The URI of the post to ingest
 */
function ingest_gallery(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        const section = $('meta[name="keywords"]').attr('content');
        const title = $('.photonews_title').text();
        const synopsis = $('.photonews_desc').text();
        const category = $('div.nav').first();

        // Article Settings
        asset.set_canonical_uri(uri);
        asset.set_section(section);
        asset.set_title(title);
        asset.set_synopsis(synopsis);

        // fixing relative paths
        category.find('a').map(function() {
            this.attribs.href = url.resolve(base_uri, this.attribs.href);
            for(const attr of remove_attr) {
                $(this).removeAttr(attr);
            }
        });

        // change date format (dd/mm/yyyy) by (mm/dd/yyyy)
        const modified_time = $('div.photonewsdatetime').text();
        const c=modified_time,d=c.substring(c.indexOf(',')+2),a=d.substring(0,2),b=d.substring(3,5);
        const format_date = d.replace(b,a).replace(a,b);
        const date = new Date(Date.parse(format_date));
        asset.set_last_modified_date(date);

        // main image
        let image_id = [];
        const main_image_uri = $('.photonews_image img').first().attr('data-src');
        const main_image = libingester.util.download_image(main_image_uri);
        main_image.set_title(title);
        asset.set_thumbnail(main_image);
        hatch.save_asset(main_image);
        image_id.push({id: main_image.asset_id});

        // max number of images for generate links
        let max_num = $('.photonews_top').first().text().split('\n')[2];
        const m=max_num,n=m.substring(m.indexOf('dari')+5,m.indexOf('foto')-1);
        max_num = parseInt(n);

        // generating image links
        let image_uris = [];
        for(var i=2; i<=max_num; i++){
            image_uris.push( main_image_uri.replace('001-bola',pad(i,3)+'-bola') );
        }

        // download images
        image_uris.map((link) => {
            const image = libingester.util.download_image(link);
            image.set_title(title);
            hatch.save_asset(image);
            image_id.push({id: image.asset_id});
        });

        render_template(hatch, asset, template.template_gallery, {
            title: title,
            published: modified_time,
            category: category.html(),
            gallery: image_id,
            body: synopsis,
        });
    }).catch((err) => {
        return ingest_gallery(hatch, uri);
    });
}

/**
 * ingest_video
 *
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {Object} obj The objec {} with metadata (uri, author, etc)
 */
function ingest_video(hatch, obj) {
    return libingester.util.fetch_html(obj.uri).then(($) => {
        const date = new Date(Date.parse(obj.pubDate));
        const synopsis = $('meta[name="description"]').attr('content');
        const thumb_url = $('meta[property="og:image"]').attr('content');
        const title = obj.title || $('.op-line h1').text();

        const save_video_asset = (video_url) => {
            if (video_url) {
                // thumbnail
                const thumbnail = libingester.util.download_image(thumb_url);
                thumbnail.set_title(title);
                hatch.save_asset(thumbnail);

                const video = new libingester.VideoAsset();
                video.set_canonical_uri(obj.uri);
                video.set_download_uri(video_url);
                video.set_last_modified_date(date);
                video.set_synopsis(synopsis);
                video.set_thumbnail(thumbnail);
                video.set_title(title);
                hatch.save_asset(video);
            }
        }

        // save video asset
        const video_page = $('.ncont iframe').first().attr('src');
        if (video_page) {
            for (const domain of video_iframes) {
                if (video_page.includes(domain)) {
                    switch (domain) {
                        case 'a.kapanlagi': {
                            return libingester.util.fetch_html(video_page).then(($) => {
                                const video_url = $('title').text();
                                return save_video_asset(video_url);
                            });
                            break; // exit 'a.kapanlagi'
                        }
                        case 'skrin.id': {
                            const base_video_uri = 'https://play.skrin.id/media/videoarchive/';
                            const video_width = '480p.mp4';
                            let temp_uri;
                            return libingester.util.fetch_html(video_page).then(($) => {
                                const ss = $('script')[2].children[0].data; //script data
                                const video_uris = get_json_parse(ss).map((data) => {
                                	return url.resolve(base_video_uri, data.url);
                                });
                                for (const video_uri of video_uris) {
                                    if (video_uri.includes(video_width)) {
                                        temp_uri = video_uri;
                                        break;
                                    }
                                }
                                const video_url = temp_uri || video_uris[video_uris.length-1];
                                return save_video_asset(video_url);
                            });
                            break; // exit 'skrin.id'
                        }
                        default: {
                            return save_video_asset(video_page);
                        }
                    }
                }
            }
        }
    }).catch((err) => {
        return ingest_video(hatch, obj);
    });
}

function main() {
    const hatch = new libingester.Hatch();

    // create object from rss
    const get_obj = ($, item) => {
        return {
            author: $(item).find('author').text(),
            category: $(item).find('category').text(),
            pubDate: $(item).find('pubDate').text(),
            title: $(item).find('title').html().replace('<!--[CDATA[','').replace(']]-->',''),
            uri: $(item).find('link')[0].next['data'].replace(new RegExp('[\n\']','g'),''),
        }
    }

    // all ingestor for article and video posts
    const article = libingester.util.fetch_html(rss_uri).then(($) => {
        let promises = [];
        for (const item of $('item').get()) {
            const obj = get_obj($, item);
            if( obj.category == 'open-play' ) {
                promises.push( ingest_video(hatch, obj) ); // video articles
            } else if( obj.category != 'galeri' ){
                promises.push( ingest_article(hatch, obj) ); // post articles
            }
        }
        return Promise.all(promises);
    });

    // all ingestor for gallery posts
    const gallery = libingester.util.fetch_html(gallery_uri).then(($) => {
        return Promise.all(
            $('.photonews_preview .title').get().map((item) => {
                return ingest_gallery(hatch, url.resolve(gallery_uri, item.attribs.href));
            })
        );
    });

    Promise.all([article, gallery]).then(() => {
        return hatch.finish();
    });
}

main();
