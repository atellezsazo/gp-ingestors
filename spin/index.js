'use strict';

const libingester = require('libingester');
const url = require('url');

const CATEGORY_LINKS = [
    'http://www.spin.ph/news',
    'http://www.spin.ph/special-reports', //Special Reports
    'http://www.spin.ph/active-lifestyle', //bidi bidi bong
    'http://www.spin.ph/sports/opinion', //Opinion
    'http://www.spin.ph/multimedia' //Multimedia
];

/** delete duplicated elements in array **/
Array.prototype.unique = function(a) {
    return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

// max number of links per category
const MAX_LINKS = 5;

const CUSTOM_CSS = `
$primary-light-color: #E50200;
$primary-medium-color: #262626;
$primary-dark-color: #000000;
$accent-light-color: #E50200;
$accent-dark-color: #C90200;
$background-light-color: #F4F4F4;
$background-dark-color: #CCCCCC;
$title-font: 'Roboto';
$body-font: 'Merriweather';
$display-font: 'Titillium Web';
$context-font: 'Titillium Web';
$support-font: 'Roboto';
@import "_default";
`;

const CLEAN_TAGS = [
    'p',
    'span',
    'div'
];

// clean images
const REMOVE_ATTR = [
    'class',
    'data-src',
    'data-te-category',
    'data-te-label',
    'data-te-tracked',
    'style',
];

// Remove elements (body)
const REMOVE_ELEMENTS = [
    'blockquote',
    'div',
    'link',
    'noscript',
    'script',
    'style',
    '.author-twitter',
];


function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.NewsArticle();
        const author = $('meta[name="author"]').attr('content');
        const section = $(".breadcrumb a").first().text();
        let body = $('.article-content div');
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const info_date = $('meta[name="article.published"]').attr('content');
        const modified_date = info_date ? new Date(Date.parse(info_date)) : new Date();
        const page = 'Spin';
        const read_more = `Original article at <a href="${canonical_uri}">${page}</a>`;
        const synopsis = $('meta[name="description"]').attr('content');
        const title = $('meta[name="title"]').attr('content');
        const uri_main_image = $('meta[property="og:image"]').attr('content');

        if (!body[0]) { // Error 404
            return;
        }

        // Pull out the main image
        let main_image, image_credit;
        if (uri_main_image) {
            main_image = libingester.util.download_image(uri_main_image);
            main_image.set_title(title);
            image_credit=$('div .cXenseParse').first().next().text();
            hatch.save_asset(main_image);
            asset.set_thumbnail(main_image);
        }

        //Clean divs
        const first_p2=body.find('p.cXenseParse').first();
            if(first_p2.find('div')[0]){
                first_p2.find('p').map(function(){
                    body.append($(this).clone());
                });
                first_p2.remove();
            }

        // remove elements
        const clean_attr = (elem) => REMOVE_ATTR.forEach(attr => $(elem).removeAttr(attr));
        body.find(REMOVE_ELEMENTS.join(',')).remove();

        // set first paragraph
        const first_p = body.find('p').first();
        const lede = first_p.clone();
        lede.find('img').remove();
        asset.set_lede(lede);
        body.find(first_p).remove();

        //download image
        body.find('.content-image-wrapper').map(function() {
            const img =$(this).find('img').first();
            if(img[0]){
                const src=img[0].attribs.src;
                const alt=img[0].attribs.alt || '';
                const figcaption = $(this).find('.cXenseParse').first().text();
                const figure = $(`<figure><img alt="${alt}" src="${src}" /></figure>`);
                img.remove();
                if (figcaption) figure.append($(`<figcaption><p>${figcaption}</p></figcaption>`));
                const image = libingester.util.download_img($(figure.children()[0]));
                image.set_title(title);
                hatch.save_asset(image);
                $(this).replaceWith(figure);
            }
            else {
                $(this).remove();
            }
        });

        // Set h2 on p > strong
        body.find('p').map((i,elem)=>{
            const strong = $(elem).find('strong').first();
            if (strong[0]) {
                const h2 = $(`<h2>${strong.text()}</h2>`);
                $(elem).replaceWith(h2);
            }
        });

        // clean tags
        body.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();
        body.find(CLEAN_TAGS.join(',')).map((i,elem) => clean_attr(elem));

        // Article Settings
        console.log('processing', title);
        asset.set_authors([author]);
        asset.set_canonical_uri(canonical_uri);
        asset.set_custom_scss(CUSTOM_CSS);
        asset.set_date_published(modified_date);
        asset.set_last_modified_date(modified_date);
        asset.set_read_more_link(read_more);
        asset.set_section(section);
        asset.set_source(page);
        asset.set_synopsis(synopsis);
        asset.set_title(title);
        asset.set_main_image(main_image,image_credit);
        asset.set_body(body);

        asset.render();
        hatch.save_asset(asset);

   }).catch((err) => {
       console.log('Ingest article error: ', err);
       if (err.code==-1) { return ingest_article(hatch, uri); }
   });
}

function ingest_video (hatch, uri){
    return libingester.util.fetch_html(uri).then($ => {

        const asset = new libingester.VideoAsset();
        
        if (!$('script[type="application/ld+json"]').text()) { // Error 404
            return;
        }
        // Catch info video
        const video_json = JSON.parse($('script[type="application/ld+json"]').text());

        const date = new Date(Date.parse(video_json.uploadDate));
        const title = video_json.name;
        const video_uri = video_json.embedUrl;
        const thumbnail = video_json.thumbnailUrl;


        const image = libingester.util.download_image(thumbnail);
        image.set_title(title);
        hatch.save_asset(image);

        console.log('Video processing', title, ' | ', uri);
        asset.set_last_modified_date(date);
        asset.set_title(title);
        asset.set_canonical_uri(uri);
        asset.set_thumbnail(image)
        asset.set_download_uri(video_uri);
        hatch.save_asset(asset);

       }).catch((err) => {
           console.log('Ingest video error: ', err);
           if (err.code==-1) { return ingest_video(hatch, uri); }
       });
}

function ingest_gallery(hatch, uri){
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.NewsArticle();
        const author = $('meta[name="author"]').attr('content');
        let body = $('#gallery-thumbs');
        const title = $('meta[name="title"]').attr('content');
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        let date = $('meta[name="pub_date"]').attr('content');
        date=new Date(Date.parse(date));
        const page = 'Spin';
        const read_more = `Original article at <a href="${canonical_uri}">${page}</a>`;
        const section = $(".breadcrumbs a").first().text();
        const synopsis = $('meta[name="description"]').attr('content');
        let thumbnail;
        const uri_main_image = $('meta[property="og:image"]').attr('content');

        if (!body[0]) { // Error 404
            return;
        }

        body.find('li').map((i, elem) => {
            const img = $(elem).find('img').first();
            const caption = img.attr('title');
            const image = `<img src="${img.attr('src')}" alt="${img.attr('alt')}">`;
            const figure = $(`<figure>${image}</figure>`);
            const figcaption = $(`<figcaption><p>${caption}</p></figcaption>`);
            const down_img = libingester.util.download_img($(figure.children()[0]));
            down_img.set_title(title);
            hatch.save_asset(down_img);
            $(elem).replaceWith(figure.append(figcaption));
        });

        // Article Settings
        console.log('processing', title);
        asset.set_authors([author]);
        asset.set_lede(title);
        asset.set_date_published(date);
        asset.set_last_modified_date(date);
        asset.set_read_more_link(read_more);
        asset.set_section(section);
        asset.set_source(page);
        asset.set_synopsis(synopsis);
        asset.set_title(title);
        asset.set_body(body);
        asset.set_canonical_uri(uri);
        asset.set_title(title);
        asset.set_custom_scss(CUSTOM_CSS);
        asset.render();
        hatch.save_asset(asset);

       }).catch((err) => {
           console.log('Ingest article error: ', err);
           if (err.code==-1) { return ingest_gallery(hatch, uri); }
       });
}

function main() {
    const hatch = new libingester.Hatch('spin', 'en');

    const get_all_links = () => {
        let all_links = [];
        return Promise.all(
            CATEGORY_LINKS.map(link => libingester.util.fetch_html(link).then($ => {
                let links = $('.thumbnail a').map((i, elem) => elem.attribs.href).get();
                if (links.length==0) {
                    links = $('.article-list-title').map((i, elem) => $(elem).parent().attr('href')).get();
                }
                all_links = all_links.concat(links.slice(0, MAX_LINKS));
        }))).then(() => all_links.unique());
    }

    const ingest_by_category = (hatch, uri) => {
        if (uri.includes('/video')) {
            return ingest_video(hatch, uri);
        } else if (uri.includes('/gallery')) {
            return ingest_gallery(hatch, uri);
        } else {
            return ingest_article(hatch, uri);
        }
    }

    get_all_links().then(links => {
        Promise.all(links.map(link => ingest_by_category(hatch, link)))
            .then(() => hatch.finish())
    }).catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
